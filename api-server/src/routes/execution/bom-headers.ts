import { Router } from "express";
import { BomHeaders } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler } from "./_shared";
import { makeCrudRouter } from "./_crud-factory";

const crudRouter = makeCrudRouter({
  schema: "execution",
  table: "bom_headers",
  createSchema: BomHeaders.CreateBomHeaderSchema,
  updateSchema: BomHeaders.UpdateBomHeaderSchema,
  listQuerySchema: BomHeaders.ListBomHeadersQuerySchema,
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "bom_type", kind: "eq" },
    { key: "state", kind: "eq" },
  ],
  searchColumns: ["bom_number", "name", "product_code", "product_description"],
  orderByAllowed: ["bom_number", "name", "version", "state", "created_at"],
});

const extra = Router();
extra.use(requireExecutionAuth);

extra.post("/:id/release", asyncHandler(async (req, res) => {
  const uid = req.userId ? parseInt(req.userId, 10) : null;
  const rows = await query(
    `UPDATE execution.bom_headers SET state = 'released', approved_by_user_id = $1, approved_at = now(),
       updated_at = now(), updated_by = $1 WHERE id = $2 AND state IN ('draft','in_review','approved') RETURNING *`,
    [uid, req.params.id]
  );
  if (!rows.length) { res.status(409).json({ error: "Cannot release from current state" }); return; }
  await audit(req, "execution.bom_headers", req.params.id, "UPDATE", null, { action: "release" });
  res.json({ data: rows[0] });
}));

const router = Router();
router.use(extra);
router.use(crudRouter);

export default router;
