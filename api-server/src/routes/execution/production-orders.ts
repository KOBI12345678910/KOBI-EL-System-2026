import { Router } from "express";
import { ProductionOrders } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler } from "./_shared";
import { makeCrudRouter } from "./_crud-factory";

const crudRouter = makeCrudRouter({
  schema: "execution",
  table: "production_orders",
  createSchema: ProductionOrders.CreateProductionOrderSchema,
  updateSchema: ProductionOrders.UpdateProductionOrderSchema,
  listQuerySchema: ProductionOrders.ListProductionOrdersQuerySchema,
  listFilters: [
    { key: "state", kind: "eq" },
    { key: "work_center_id", kind: "eq" },
    { key: "project_id", kind: "eq" },
    { key: "priority", kind: "eq" },
  ],
  searchColumns: ["order_number", "product_code", "product_description"],
  orderByAllowed: ["created_at", "planned_start", "priority", "state"],
  defaultOrderBy: "planned_start",
});

const extra = Router();
extra.use(requireExecutionAuth);

extra.post("/:id/release", asyncHandler(async (req, res) => {
  const rows = await query(
    `UPDATE execution.production_orders SET state = 'released', updated_at = now(), updated_by = $1
     WHERE id = $2 AND state IN ('draft','scheduled') RETURNING *`,
    [req.userId ? parseInt(req.userId, 10) : null, req.params.id]
  );
  if (!rows.length) { res.status(409).json({ error: "Cannot release from current state" }); return; }
  await audit(req, "execution.production_orders", req.params.id, "UPDATE", null, { action: "release" });
  res.json({ data: rows[0] });
}));

extra.post("/:id/complete", asyncHandler(async (req, res) => {
  const rows = await query(
    `UPDATE execution.production_orders SET state = 'completed', actual_end = now(), progress_percent = 100,
       updated_at = now(), updated_by = $1 WHERE id = $2 AND state IN ('in_progress','paused') RETURNING *`,
    [req.userId ? parseInt(req.userId, 10) : null, req.params.id]
  );
  if (!rows.length) { res.status(409).json({ error: "Cannot complete from current state" }); return; }
  await audit(req, "execution.production_orders", req.params.id, "UPDATE", null, { action: "complete" });
  res.json({ data: rows[0] });
}));

const router = Router();
router.use(extra);
router.use(crudRouter);

export default router;
