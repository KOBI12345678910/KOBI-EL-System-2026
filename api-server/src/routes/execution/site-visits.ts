import { Router } from "express";
import { SiteVisits } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler } from "./_shared";
import { makeCrudRouter } from "./_crud-factory";

const crudRouter = makeCrudRouter({
  schema: "execution",
  table: "site_visits",
  createSchema: SiteVisits.CreateSiteVisitSchema,
  updateSchema: SiteVisits.UpdateSiteVisitSchema,
  listQuerySchema: SiteVisits.ListSiteVisitsQuerySchema,
  jsonbColumns: ["photos", "documents", "metadata"],
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "installation_team_id", kind: "eq" },
    { key: "state", kind: "eq" },
    { key: "visit_type", kind: "eq" },
    { key: "from_date", column: "scheduled_at", kind: "gte" },
    { key: "to_date", column: "scheduled_at", kind: "lte" },
  ],
  searchColumns: ["visit_number", "site_name", "site_address", "site_contact_name"],
  orderByAllowed: ["scheduled_at", "completed_at", "state", "visit_type"],
  defaultOrderBy: "scheduled_at",
});

const extra = Router();
extra.use(requireExecutionAuth);

extra.post("/:id/start", asyncHandler(async (req, res) => {
  const rows = await query(
    `UPDATE execution.site_visits SET state = 'on_site', started_at = COALESCE(started_at, now()), updated_at = now(), updated_by = $1
     WHERE id = $2 AND state IN ('scheduled','en_route') RETURNING *`,
    [req.userId ? parseInt(req.userId, 10) : null, req.params.id]
  );
  if (!rows.length) { res.status(409).json({ error: "Cannot start from current state" }); return; }
  await audit(req, "execution.site_visits", req.params.id, "UPDATE", null, { action: "start" });
  res.json({ data: rows[0] });
}));

extra.post("/:id/complete", asyncHandler(async (req, res) => {
  const rows = await query(
    `UPDATE execution.site_visits SET state = 'completed', completed_at = now(), updated_at = now(), updated_by = $1
     WHERE id = $2 AND state IN ('on_site','en_route') RETURNING *`,
    [req.userId ? parseInt(req.userId, 10) : null, req.params.id]
  );
  if (!rows.length) { res.status(409).json({ error: "Cannot complete from current state" }); return; }
  await audit(req, "execution.site_visits", req.params.id, "UPDATE", null, { action: "complete" });
  res.json({ data: rows[0] });
}));

const router = Router();
router.use(extra);
router.use(crudRouter);

export default router;
