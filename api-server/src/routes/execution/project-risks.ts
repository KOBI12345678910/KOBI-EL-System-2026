import { ProjectRisks } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "project_risks",
  createSchema: ProjectRisks.CreateProjectRiskSchema,
  updateSchema: ProjectRisks.UpdateProjectRiskSchema,
  listQuerySchema: ProjectRisks.ListProjectRisksQuerySchema,
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "state", kind: "eq" },
  ],
  searchColumns: ["risk_title", "description"],
  orderByAllowed: ["created_at", "updated_at", "state"],
});

export default router;
