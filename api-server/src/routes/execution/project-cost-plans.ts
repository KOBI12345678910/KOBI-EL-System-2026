import { ProjectCostPlans } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "project_cost_plans",
  createSchema: ProjectCostPlans.CreateProjectCostPlanSchema,
  updateSchema: ProjectCostPlans.UpdateProjectCostPlanSchema,
  listQuerySchema: ProjectCostPlans.ListProjectCostPlansQuerySchema,
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "cost_category", kind: "eq" },
  ],
  searchColumns: ["description"],
  orderByAllowed: ["created_at", "planned_amount", "actual_amount", "cost_category"],
});

export default router;
