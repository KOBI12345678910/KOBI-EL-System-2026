import { InstallationEvents } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "installation_events",
  createSchema: InstallationEvents.CreateInstallationEventSchema,
  updateSchema: InstallationEvents.UpdateInstallationEventSchema,
  listQuerySchema: InstallationEvents.ListInstallationEventsQuerySchema,
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "work_order_id", kind: "eq" },
    { key: "state", kind: "eq" },
  ],
  searchColumns: ["notes"],
  orderByAllowed: ["installed_at", "created_at", "state"],
  defaultOrderBy: "installed_at",
});

export default router;
