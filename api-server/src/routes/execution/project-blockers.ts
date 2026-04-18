import { ProjectBlockers } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "project_blockers",
  createSchema: ProjectBlockers.CreateProjectBlockerSchema,
  updateSchema: ProjectBlockers.UpdateProjectBlockerSchema,
  listQuerySchema: ProjectBlockers.ListProjectBlockersQuerySchema,
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "state", kind: "eq" },
    { key: "severity", kind: "eq" },
  ],
  searchColumns: ["title", "description"],
  orderByAllowed: ["created_at", "updated_at", "due_date", "severity"],
});

export default router;
