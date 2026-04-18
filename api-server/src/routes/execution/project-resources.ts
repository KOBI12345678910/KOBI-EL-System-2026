import { ProjectResources } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "project_resources",
  createSchema: ProjectResources.CreateProjectResourceSchema,
  updateSchema: ProjectResources.UpdateProjectResourceSchema,
  listQuerySchema: ProjectResources.ListProjectResourcesQuerySchema,
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "resource_type", kind: "eq" },
    { key: "state", kind: "eq" },
  ],
  searchColumns: ["resource_name"],
  orderByAllowed: ["created_at", "resource_name", "allocated_hours"],
});

export default router;
