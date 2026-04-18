import { Router } from "express";
import { PunchLists } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler } from "./_shared";
import { makeCrudRouter } from "./_crud-factory";

const crudRouter = makeCrudRouter({
  schema: "execution",
  table: "punch_lists",
  createSchema: PunchLists.CreatePunchListSchema,
  updateSchema: PunchLists.UpdatePunchListSchema,
  listQuerySchema: PunchLists.ListPunchListsQuerySchema,
  jsonbColumns: ["photos", "metadata"],
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "work_order_id", kind: "eq" },
    { key: "state", kind: "eq" },
    { key: "severity", kind: "eq" },
  ],
  searchColumns: ["list_number", "title", "description"],
  orderByAllowed: ["created_at", "due_date", "severity", "state"],
});

const extra = Router();
extra.use(requireExecutionAuth);

extra.post("/:id/resolve", asyncHandler(async (req, res) => {
  const rows = await query(
    `UPDATE execution.punch_lists SET state = 'resolved', resolved_at = now(), updated_at = now(), updated_by = $1
     WHERE id = $2 AND state IN ('open','in_progress') RETURNING *`,
    [req.userId ? parseInt(req.userId, 10) : null, req.params.id]
  );
  if (!rows.length) { res.status(409).json({ error: "Cannot resolve from current state" }); return; }
  await audit(req, "execution.punch_lists", req.params.id, "UPDATE", null, { action: "resolve" });
  res.json({ data: rows[0] });
}));

const router = Router();
router.use(extra);
router.use(crudRouter);

export default router;
