import { Router } from "express";
import { Alerts } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler, validate } from "./_shared";
import { makeCrudRouter } from "./_crud-factory";

const crudRouter = makeCrudRouter({
  schema: "execution",
  table: "alerts",
  createSchema: Alerts.CreateAlertSchema,
  updateSchema: Alerts.UpdateAlertSchema,
  listQuerySchema: Alerts.ListAlertsQuerySchema,
  listFilters: [
    { key: "category", kind: "eq" },
    { key: "severity", kind: "eq" },
    { key: "state", kind: "eq" },
  ],
  searchColumns: ["alert_number", "title", "description"],
  orderByAllowed: ["created_at", "severity", "state"],
});

const extra = Router();
extra.use(requireExecutionAuth);

extra.post("/:id/acknowledge", asyncHandler(async (req, res) => {
  const rows = await query(
    `UPDATE execution.alerts SET state = 'Acknowledged', acknowledged_at = now(), updated_at = now(), updated_by = $1 WHERE id = $2 RETURNING *`,
    [req.userId ? parseInt(req.userId, 10) : null, req.params.id]
  );
  if (!rows.length) { res.status(404).json({ error: "Alert not found" }); return; }
  await audit(req, "execution.alerts", req.params.id, "UPDATE", null, { action: "acknowledge" });
  res.json({ data: rows[0] });
}));

extra.post("/:id/resolve", asyncHandler(async (req, res) => {
  const rows = await query(
    `UPDATE execution.alerts SET state = 'Resolved', resolved_at = now(), updated_at = now(), updated_by = $1 WHERE id = $2 RETURNING *`,
    [req.userId ? parseInt(req.userId, 10) : null, req.params.id]
  );
  if (!rows.length) { res.status(404).json({ error: "Alert not found" }); return; }
  await audit(req, "execution.alerts", req.params.id, "UPDATE", null, { action: "resolve" });
  res.json({ data: rows[0] });
}));

const router = Router();
router.use(extra);
router.use(crudRouter);

export default router;
